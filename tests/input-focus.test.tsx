// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DynamicForm, type CustomField } from "@/components/dynamic/DynamicForm";
import { Modal } from "@/components/ui/Modal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: Root; host: HTMLDivElement }> = [];

function mount(ui: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push({ root, host });
  act(() => root.render(ui));
  return host;
}

function replaceInputValue(input: HTMLInputElement, value: string, caret: number, inputType = "insertText") {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.setSelectionRange(caret, caret);
  act(() => {
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: value }));
  });
}

function getLabeledInput(host: HTMLElement, labelText: string, index = 0) {
  const labels = [...host.querySelectorAll("label")].filter((label) => label.textContent?.trim() === labelText);
  const label = labels[index];
  return label ? host.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`) : null;
}

function DynamicFormHarness() {
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({ testField: "" });
  const [customFields, setCustomFields] = useState<CustomField[]>([
    { id: "first-row", key: "", value: "" },
    { id: "second-row", key: "second", value: "" },
  ]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  return (
    <Modal title="Dynamic form" onClose={() => setOpen(false)}>
      <DynamicForm
        fields={[{ key: "testField", label: "Test field", type: "text", required: false }]}
        values={values}
        fieldErrors={fieldErrors}
        onChange={(key, value) => {
          setValues((previous) => ({ ...previous, [key]: value }));
          setFieldErrors(value === "hello" ? { [key]: "Please check this value." } : {});
        }}
        customFields={customFields}
        onCustomFieldsChange={setCustomFields}
      />
      {fieldErrors.testField ? <p role="alert">{fieldErrors.testField}</p> : null}
      {!open ? <p>The dialog closed.</p> : null}
    </Modal>
  );
}

afterEach(() => {
  for (const { root, host } of mountedRoots.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

describe("dynamic form input identity", () => {
  it("keeps focus while typing quickly, pasting, editing in the middle, and rerendering validation", () => {
    const host = mount(<DynamicFormHarness />);
    const fieldName = getLabeledInput(host, "Test field");
    expect(fieldName).not.toBeNull();
    fieldName!.focus();

    for (const char of "hello") {
      replaceInputValue(fieldName!, fieldName!.value + char, fieldName!.value.length + 1);
      expect(document.activeElement).toBe(fieldName);
    }
    expect(fieldName!.value).toBe("hello");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Please check this value.");

    replaceInputValue(fieldName!, "hello world", 11, "insertFromPaste");
    expect(fieldName!.value).toBe("hello world");
    expect(document.activeElement).toBe(fieldName);

    replaceInputValue(fieldName!, "heXllo world", 3);
    expect(fieldName!.value).toBe("heXllo world");
    expect(fieldName!.selectionStart).toBe(3);
    expect(document.activeElement).toBe(fieldName);

    replaceInputValue(fieldName!, "heXlo world", 4, "deleteContentBackward");
    expect(fieldName!.value).toBe("heXlo world");
    expect(document.activeElement).toBe(fieldName);

  });

  it("keeps the focused row mounted when a preceding dynamic field is removed", () => {
    const host = mount(<DynamicFormHarness />);
    const secondFieldName = getLabeledInput(host, "Field name", 1)!;
    secondFieldName.focus();

    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Remove "]')!.click());

    const remainingField = getLabeledInput(host, "Field name");
    expect(remainingField).toBe(secondFieldName);
    expect(document.activeElement).toBe(secondFieldName);
  });
});
