// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "@/components/chat/Composer";
import { ConversationPanel } from "@/components/chat/ConversationPanel";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { groupByDay, type ChatMessage } from "@/components/chat/types";
import { extensionForMime } from "@/hooks/use-voice-recorder";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: Root; host: HTMLDivElement }> = [];

function mount(ui: ReactNode): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push({ root, host });
  act(() => root.render(ui));
  return host;
}

afterEach(() => {
  for (const { root, host } of mountedRoots.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.restoreAllMocks();
  localStorage.clear();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** jsdom's selector engine can't match astral-plane chars in attribute values — scan instead. */
function findButton(host: HTMLDivElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);
  if (!found) throw new Error(`button not found: ${label}`);
  return found as HTMLButtonElement;
}

/** Drive a React controlled textarea through its native setter. */
function typeInto(area: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(area, value);
  area.dispatchEvent(new Event("input", { bubbles: true }));
}

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    kind: "user",
    body: "hello",
    senderId: "u1",
    senderName: "Ama",
    senderShortId: "ABC123",
    clientMessageId: "c1",
    createdAt: new Date().toISOString(),
    editedAt: null,
    deleted: false,
    reply: null,
    metadata: {},
    attachment: null,
    reactions: [],
    read: false,
    readCount: null,
    ...overrides,
  };
}

function bubbleProps(overrides = {}) {
  return {
    message: baseMessage(),
    mine: true,
    canModerate: false,
    onReply: () => {},
    onReact: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onForward: () => {},
    onShareLink: () => {},
    onJump: () => {},
    onAnalyze: () => {},
    onTranscribe: () => {},
    analyzing: false,
    transcript: null,
    delivered: false,
    onError: () => {},
    ...overrides,
  };
}

describe("MessageBubble delivery state", () => {
  it("shows Sending for optimistic pending messages", () => {
    const host = mount(<MessageBubble {...bubbleProps({ message: baseMessage({ id: "pending:xyz" }) })} />);
    expect(host.textContent).toContain("Sending…");
  });
  it("shows Sent once persisted without delivery confirmation", () => {
    const host = mount(<MessageBubble {...bubbleProps()} />);
    expect(host.textContent).toContain("Sent");
    expect(host.querySelector('[title="Sent"]')).not.toBeNull();
  });
  it("shows Delivered after a device beacon", () => {
    const host = mount(<MessageBubble {...bubbleProps({ delivered: true })} />);
    expect(host.querySelector('[title="Delivered"]')).not.toBeNull();
  });
  it("shows Read once the peer reads", () => {
    const host = mount(
      <MessageBubble {...bubbleProps({ delivered: true, message: baseMessage({ read: true }) })} />,
    );
    expect(host.querySelector('[title="Read"]')).not.toBeNull();
  });
  it("shows Seen by N in groups", () => {
    const host = mount(<MessageBubble {...bubbleProps({ message: baseMessage({ readCount: 3 }) })} />);
    expect(host.textContent).toContain("Seen by 3");
  });
  it("hides actions and status for deleted tombstones", () => {
    const host = mount(
      <MessageBubble {...bubbleProps({ message: baseMessage({ deleted: true, body: "This message was deleted." }) })} />,
    );
    expect(host.textContent).toContain("This message was deleted.");
    expect(host.querySelector('[aria-label="Message actions"]')).toBeNull();
  });
  it("suppresses the menu for non-interactive pending bubbles", () => {
    const host = mount(
      <MessageBubble
        {...bubbleProps({ interactive: false, message: baseMessage({ id: "pending:xyz" }) })}
      />,
    );
    expect(host.querySelector('[aria-label="Message actions"]')).toBeNull();
  });
});

describe("Composer", () => {
  function composerProps(overrides = {}) {
    return {
      conversationId: "conv1",
      replyTo: null,
      onClearReply: () => {},
      onTyping: () => {},
      onSent: () => {},
      onSending: () => {},
      onSendFailed: () => {},
      onError: () => {},
      seed: null,
      ...overrides,
    };
  }

  it("inserts emoji from the picker into the draft", () => {
    const host = mount(<Composer {...composerProps()} />);
    const area = host.querySelector('textarea[aria-label="Message text"]') as HTMLTextAreaElement;
    act(() => {
      findButton(host, "Insert emoji").click();
    });
    act(() => {
      findButton(host, "Insert 🎉").click();
    });
    expect(area.value).toContain("🎉");
  });

  it("sends optimistically, posts once, then confirms", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push(String(JSON.parse(String(init?.body)).clientMessageId));
      return jsonResponse({ ok: true, data: { id: "m9" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSending = vi.fn();
    const onSent = vi.fn();
    const host = mount(<Composer {...composerProps({ onSending, onSent })} />);
    const area = host.querySelector('textarea[aria-label="Message text"]') as HTMLTextAreaElement;
    await act(async () => {
      area.focus();
      typeInto(area, "hi there");
    });
    await act(async () => {
      (host.querySelector('[aria-label="Send message"]') as HTMLButtonElement).click();
    });
    expect(onSending).toHaveBeenCalledTimes(1);
    expect(onSending.mock.calls[0][0].body).toBe("hi there");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen[0]).toBe(onSending.mock.calls[0][0].clientMessageId);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(area.value).toBe("");
  });

  it("drops the optimistic bubble but keeps text when the POST fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false, error: "nope" }, 500)));
    const onSendFailed = vi.fn();
    const onError = vi.fn();
    const host = mount(<Composer {...composerProps({ onSendFailed, onError })} />);
    const area = host.querySelector('textarea[aria-label="Message text"]') as HTMLTextAreaElement;
    await act(async () => {
      area.focus();
      typeInto(area, "keep me");
    });
    await act(async () => {
      area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSendFailed).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(area.value).toBe("keep me");
  });

  it("restores a saved draft on mount", () => {
    localStorage.setItem("chat:draft:conv1", "drafted text");
    const host = mount(<Composer {...composerProps()} />);
    const area = host.querySelector('textarea[aria-label="Message text"]') as HTMLTextAreaElement;
    expect(area.value).toBe("drafted text");
  });

  it("shows the reply chip and clears it", () => {
    const onClearReply = vi.fn();
    const host = mount(<Composer {...composerProps({ replyTo: baseMessage(), onClearReply })} />);
    expect(host.textContent).toContain("Replying to Ama");
    act(() => {
      (host.querySelector('[aria-label="Cancel reply"]') as HTMLButtonElement).click();
    });
    expect(onClearReply).toHaveBeenCalledTimes(1);
  });
});

describe("voice recording", () => {
  it("maps recorder MIME types to file extensions", () => {
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMime("audio/mp4")).toBe("m4a");
    expect(extensionForMime("audio/ogg")).toBe("ogg");
    expect(extensionForMime("audio/wav")).toBe("wav");
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
    expect(extensionForMime("")).toBe("webm");
  });

  it("reports honestly when the browser has no microphone API", async () => {
    const onError = vi.fn();
    const host = mount(
      <Composer
        conversationId="conv1"
        replyTo={null}
        onClearReply={() => {}}
        onTyping={() => {}}
        onSent={() => {}}
        onSending={() => {}}
        onSendFailed={() => {}}
        onError={onError}
        seed={null}
      />,
    );
    await act(async () => {
      (host.querySelector('[aria-label="Record a voice note"]') as HTMLButtonElement).click();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain("unavailable in this browser");
  });
});

describe("Chat in-flow trays (no overlay conflicts)", () => {
  /** The tray must live in normal flow — never an absolutely-positioned overlay. */
  function assertInFlow(el: Element, scope: Element) {
    let node: Element | null = el;
    while (node && node !== scope) {
      const cls = node.getAttribute("class") ?? "";
      expect(cls).not.toMatch(/(^|\s)(absolute|fixed)($|\s)/);
      node = node.parentElement;
    }
  }

  it("opens the message action tray in-flow inside the same bubble", () => {
    const host = mount(<MessageBubble {...bubbleProps()} />);
    act(() => {
      (host.querySelector('[aria-label="Message actions"]') as HTMLButtonElement).click();
    });
    const panel = host.querySelector('[aria-label="Message actions panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.closest("li")).not.toBeNull();
    expect(panel?.textContent).toContain("Reply");
    expect(panel?.textContent).toContain("Forward");
    assertInFlow(panel as Element, host);
  });

  it("opens the reaction picker in-flow and reacts on tap", () => {
    const onReact = vi.fn();
    const host = mount(<MessageBubble {...bubbleProps({ onReact })} />);
    act(() => {
      (host.querySelector('[aria-label="Message actions"]') as HTMLButtonElement).click();
    });
    const reactBtn = [...host.querySelectorAll("button")].find((b) => b.textContent === "React");
    act(() => {
      (reactBtn as HTMLButtonElement).click();
    });
    const picker = host.querySelector('[aria-label="Reaction picker"]');
    expect(picker).not.toBeNull();
    assertInFlow(picker as Element, host);
    act(() => {
      findButton(host, "React with 🎉").click();
    });
    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onReact.mock.calls[0][1]).toBe("🎉");
  });

  it("shows a short timestamp with the full date on hover", () => {
    const host = mount(<MessageBubble {...bubbleProps()} />);
    const time = host.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.getAttribute("title")).toContain(",");
    expect(time?.textContent ?? "").toMatch(/^\d{1,2}:\d{2}\s?[AP]M$/i);
  });

  it("opens the composer emoji tray in-flow above the input", () => {
    const host = mount(
      <Composer
        conversationId="conv1"
        replyTo={null}
        onClearReply={() => {}}
        onTyping={() => {}}
        onSent={() => {}}
        onSending={() => {}}
        onSendFailed={() => {}}
        onError={() => {}}
        seed={null}
      />,
    );
    act(() => {
      findButton(host, "Insert emoji").click();
    });
    const tray = host.querySelector('[aria-label="Emoji picker"]');
    expect(tray).not.toBeNull();
    assertInFlow(tray as Element, host);
  });

  it("opens conversation row options in-flow inside the same row", async () => {
    const item = {
      id: "c1",
      type: "direct",
      title: "Ama",
      groupId: null,
      updatedAt: new Date().toISOString(),
      unread: 2,
      lastMessage: { preview: "hey", createdAt: new Date().toISOString() },
      memberCount: 2,
      peerShortId: "AB12",
      providerKind: null,
      hasProject: false,
      muted: false,
      pinned: false,
      archived: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/profile")) {
          return jsonResponse({ ok: true, data: { name: "Me", shortId: "ME01" } });
        }
        return jsonResponse({ ok: true, data: { individual: [item], group: [] } });
      }),
    );
    const host = mount(<ConversationPanel onError={() => {}} />);
    await act(async () => {});
    const toggle = host.querySelector('[aria-label="Conversation options for Ama"]') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    act(() => {
      toggle.click();
    });
    const panel = host.querySelector('[aria-label="Options for Ama"]');
    expect(panel).not.toBeNull();
    expect(panel?.closest("li")).not.toBeNull();
    expect(panel?.textContent).toContain("Mute");
    expect(panel?.textContent).toContain("Archive");
    assertInFlow(panel as Element, host);
  });
});

describe("groupByDay", () => {
  it("groups messages by calendar day", () => {
    const groups = groupByDay([
      baseMessage({ id: "a", createdAt: "2026-05-01T10:00:00Z" }),
      baseMessage({ id: "b", createdAt: "2026-05-01T11:00:00Z" }),
      baseMessage({ id: "c", createdAt: "2026-05-02T09:00:00Z" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((m) => m.id)).toEqual(["a", "b"]);
    expect(groups[1].items.map((m) => m.id)).toEqual(["c"]);
  });
});
