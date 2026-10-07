import { expect, test, vi } from "vitest";
import { fetchAnnotationPage, fetchReviewedMarkers } from "./annotation-queries";

test("pages annotations with database filters, safe search text, and a stable cursor", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    requests.push(new URL(String(input)));
    return Response.json([{id:"b",created_at:"2026-10-01",notes:"one"},{id:"a",created_at:"2026-10-01",notes:"two"}]);
  }));
  const page = await fetchAnnotationPage({camera:"CAM-1", site:"Site A", type:"Seabird", date:"2026-10-01",search:'bird, "egg"'}, {id:"z",created_at:"2026-10-02"}, 1);
  expect(page.rows).toHaveLength(1); expect(page.hasNext).toBe(true);
  expect(requests[0].searchParams.get("camera")).toBe("eq.CAM-1");
  expect(requests[0].searchParams.get("retrieval_date")).toBe("eq.2026-10-01");
  expect(requests[0].searchParams.get("limit")).toBe("2");
  expect(requests[0].searchParams.get("order")).toBe("created_at.desc,id.desc");
  expect(requests[0].searchParams.get("or")).toContain('created_at.lt.');
  expect(requests[0].searchParams.get("or")).toContain('bird, \\"egg\\"');
});

test("loads narrow reviewed markers beyond the first database response", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input)); requests.push(url);
    const rows = url.searchParams.has("id") ? [{id:"last",start_filename:"last.jpg",end_filename:"last.jpg"}] : Array.from({length:500},(_,i)=>({id:`id-${i}`,start_filename:"frame.jpg",end_filename:"frame.jpg"}));
    return Response.json(rows);
  }));
  const rows = await fetchReviewedMarkers();
  expect(rows).toHaveLength(501);
  expect(requests[0].searchParams.get("select")).toBe("id,start_filename,end_filename");
  expect(requests[1].searchParams.get("id")).toBe("gt.id-499");
});
