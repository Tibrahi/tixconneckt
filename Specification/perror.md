2026-11-02 11:32:38.511 [error] Error: Failed query: select "id", "result", "model", "segment_count", "created_by", "created_at" from "call_interpretations" where "call_interpretations"."call_id" = $1 order by "call_interpretations"."created_at" desc limit $2
params: eae8e547-b125-4ba6-8860-a3204bb12d29,1
    at g.queryWithCache (.next/server/chunks/_1r6wn_qfzmb3w._.js:7:12829)
    at async (.next/server/chunks/_1r6wn_qfzmb3w._.js:1:6701)
    at async g (.next/server/chunks/_0ahsz9b_823gs._.js:1:965)
    at async Z (.next/server/chunks/_0ahsz9b_823gs._.js:1:6907)
    at async ee (.next/server/chunks/_0ahsz9b_823gs._.js:1:7899) {
  query: 'select "id", "result", "model", "segment_count", "created_by", "created_at" from "call_interpretations" where "call_interpretations"."call_id" = $1 order by "call_interpretations"."created_at" desc limit $2',
  params: [ 'eae8e547-b125-4ba6-8860-a3204bb12d29', 1 ],
  [cause]: error: relation "call_interpretations" does not exist
      at async (.next/server/chunks/_1r6wn_qfzmb3w._.js:1:6911)
      at async g.queryWithCache (.next/server/chunks/_1r6wn_qfzmb3w._.js:7:12804)
      at async (.next/server/chunks/_1r6wn_qfzmb3w._.js:1:6701)
      at async g (.next/server/chunks/_0ahsz9b_823gs._.js:1:965)
      at async Z (.next/server/chunks/_0ahsz9b_823gs._.js:1:6907) {
    length: 119,
    severity: 'ERROR',
    code: '42P01',
    detail: undefined,
    hint: undefined,
    position: '82',
    internalPosition: undefined,
    internalQuery: undefined,
    where: undefined,
    schema: undefined,
    table: undefined,
    column: undefined,
    dataType: undefined,
    constraint: undefined,
    file: 'parse_relation.c',
    line: '1498',
    routine: 'parserOpenTable'
  }
}2026-11-02 11:32:34.520 [error] Error: Failed query: select "id", "result", "model", "segment_count", "created_by", "created_at" from "call_interpretations" where "call_interpretations"."call_id" = $1 order by "call_interpretations"."created_at" desc limit $2
params: eae8e547-b125-4ba6-8860-a3204bb12d29,1
    at g.queryWithCache (.next/server/chunks/_1r6wn_qfzmb3w._.js:7:12829)
    at async (.next/server/chunks/_1r6wn_qfzmb3w._.js:1:6701)
    at async g (.next/server/chunks/_0ahsz9b_823gs._.js:1:965)
    at async Z (.next/server/chunks/_0ahsz9b_823gs._.js:1:6907)
    at async ee (.next/server/chunks/_0ahsz9b_823gs._.js:1:7899) {
  query: 'select "id", "result", "model", "segment_count", "created_by", "created_at" from "call_interpretations" where "call_interpretations"."call_id" = $1 order by "call_interpretations"."created_at" desc limit $2',
  params: [ 'eae8e547-b125-4ba6-8860-a3204bb12d29', 1 ],
  [cause]: error: relation "call_interpretations" does not exist
      at async (.next/server/chunks/_1r6wn_qfzmb3w._.js:1:6911)
      at async g.queryWithCache (.next/server/chunks/_1r6wn_qfzmb3w._.js:7:12804)
      at async (.next/server/chunks/_1r6wn_qfzmb3w._.js:1:6701)
      at async g (.next/server/chunks/_0ahsz9b_823gs._.js:1:965)
      at async Z (.next/server/chunks/_0ahsz9b_823gs._.js:1:6907) {
    length: 119,
    severity: 'ERROR',
    code: '42P01',
    detail: undefined,
    hint: undefined,
    position: '82',
    internalPosition: undefined,
    internalQuery: undefined,
    where: undefined,
    schema: undefined,
    table: undefined,
    column: undefined,
    dataType: undefined,
    constraint: undefined,
    file: 'parse_relation.c',
    line: '1498',
    routine: 'parserOpenTable'
  }
}# GET /api/calls/eae8e547-b125-4ba6-8860-a3204bb12d29/transcript

Status: 500

## Request

Started: Nov 02 13:32:34.33 GMT+2

Request ID: kcqn4-1793619154335-11458aae779e

Path: /api/calls/eae8e547-b125-4ba6-8860-a3204bb12d29/transcript

Host: tixconneckt.vercel.app

User Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36

Referer: https://tixconneckt.vercel.app/dashboard/chat/074cf72a-5ced-479d-8f88-af754e3d4322

Search Params

- nxtPid=eae8e547-b125-4ba6-8860-a3204bb12d29

Received in Cape Town, South Africa (cpt1)

### Firewall

Allowed

Routed to Washington, D.C., USA (iad1)

### Function Invocation

Route: /api/calls/[id]/transcript

Execution Duration: 51ms

### External APIs

No outgoing requests

### Fluid

255 MB

Response finished in 300ms

## Deployment Information
Deployment ID: dpl_9abxFJGUbmUgCZf2AQw7uawTyhci
Environment: production
Branch: main