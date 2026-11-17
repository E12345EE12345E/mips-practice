import { describe, expect, it } from "vitest";
import { Machine } from "../../src/mips/machine";
import { takeSnapshot } from "../../src/mips/snapshot";
import { buildGraphModel } from "../../src/visualization/buildGraph";
import { build } from "./helpers";

function graphFor(source: string, steps?: number) {
  const machine = new Machine(build(source));
  const initial = takeSnapshot(machine);
  if (steps === undefined) machine.run();
  else for (let i = 0; i < steps; i++) machine.step();
  return buildGraphModel(takeSnapshot(machine, initial));
}

const PROLOGUE = ".data\ntext: .space 16\nptr: .word text\nnext: .space 8\n.text\nmain:\n";
const END = "\n  li $v0, 10\n  syscall\n";

describe("pointer edges", () => {
  it("la creates $t0 -> text[0] and addiu retargets it", () => {
    const g = graphFor(`${PROLOGUE}  la $t0, text${END}`, 2);
    const edge = g.edges.find((e) => e.source.handle === "reg:8")!;
    expect(edge.label).toBe("text");
    expect(edge.tone).toBe("tracked");
    expect(edge.target).toMatchObject({ nodeId: "alloc:text", handle: "dst:0" });

    const moved = graphFor(`${PROLOGUE}  la $t0, text\n  addiu $t0, $t0, 5${END}`, 3);
    const edge2 = moved.edges.find((e) => e.source.handle === "reg:8")!;
    expect(edge2.label).toBe("text + 5");
    expect(edge2.target.handle).toBe("dst:5");
    expect(edge2.id).not.toBe(edge.id);
  });

  it("creates a memory-to-memory edge for .word label initializers", () => {
    const g = graphFor(`${PROLOGUE}  nop${END}`, 0);
    const edge = g.edges.find((e) => e.source.nodeId === "alloc:ptr")!;
    expect(edge).toMatchObject({ label: "text", tone: "tracked", fromRegister: false });
    expect(edge.source.handle).toBe("src:0");
  });

  it("uses dashed (untracked) edges for plain integers that equal valid addresses", () => {
    const g = graphFor(`${PROLOGUE}  li $t0, 0x10010004${END}`, 2);
    const edge = g.edges.find((e) => e.source.handle === "reg:8")!;
    expect(edge.tone).toBe("untracked");
    expect(edge.label).toBe("text + 4");
  });

  it("draws no edge for null or ordinary integers", () => {
    const g = graphFor(`${PROLOGUE}  li $t0, 42\n  move $t1, $zero${END}`);
    expect(g.edges.filter((e) => e.fromRegister && ["reg:8", "reg:9"].includes(e.source.handle))).toEqual([]);
  });

  it("marks one-past-end pointers and out-of-bounds (dangling) pointers", () => {
    const end = graphFor(`${PROLOGUE}  la $t0, text\n  addiu $t0, $t0, 16${END}`, 3);
    const e1 = end.edges.find((e) => e.source.handle === "reg:8")!;
    expect(e1.position).toBe("end");
    expect(e1.label).toBe("text + 16 (one past end)");
    expect(e1.target.handle).toBe("dst:end");

    const dangling = graphFor(`${PROLOGUE}  la $t0, text\n  addiu $t0, $t0, 40${END}`, 3);
    const e2 = dangling.edges.find((e) => e.source.handle === "reg:8")!;
    expect(e2.position).toBe("out-of-bounds");
    expect(e2.tone).toBe("danger");
    expect(e2.label).toMatch(/out of bounds/);
  });

  it("handles aliases, self references and cycles", () => {
    const source = `.data
a: .word b
b: .word a
self: .word self
alias1:
alias2: .space 4
.text
main:
  la $t0, alias1
  la $t1, alias2
  li $v0, 10
  syscall`;
    const g = graphFor(source);
    const targets = (id: string) => g.edges.filter((e) => e.source.nodeId === id).map((e) => e.target.nodeId);
    expect(targets("alloc:a")).toEqual(["alloc:b"]);
    expect(targets("alloc:b")).toEqual(["alloc:a"]);
    expect(targets("alloc:self")).toEqual(["alloc:self"]);
    // aliases share one allocation node
    const regEdges = g.edges.filter((e) => e.fromRegister && (e.source.handle === "reg:8" || e.source.handle === "reg:9"));
    expect(new Set(regEdges.map((e) => e.target.nodeId))).toEqual(new Set(["alloc:alias1"]));
    expect(g.cards.filter((c) => c.labels.includes("alias2"))).toHaveLength(1);
  });

  it("shows $ra and $sp targets", () => {
    const g = graphFor(`${PROLOGUE}  nop${END}`, 0);
    const ra = g.edges.find((e) => e.source.handle === "reg:31")!;
    expect(ra.target.nodeId).toBe("code:host-return");
    const sp = g.edges.find((e) => e.source.handle === "reg:29")!;
    expect(sp.target.nodeId).toBe("stack");

    const withJal = graphFor(".text\nmain:\n  jal f\n  li $v0, 10\n  syscall\nf:\n  nop\n  nop", 2);
    const ra2 = withJal.edges.find((e) => e.source.handle === "reg:31")!;
    expect(ra2.target.nodeId).toBe("code:main");
    expect(ra2.label).toBe("main + 4");
  });

  it("keeps node identity by label, not by address", () => {
    const a = graphFor(".data\nx: .space 4\ny: .space 4\n.text\nmain: nop\n li $v0,10\n syscall", 0);
    const b = graphFor(".data\npad: .space 8\nx: .space 4\ny: .space 4\n.text\nmain: nop\n li $v0,10\n syscall", 0);
    const ids = (g: ReturnType<typeof graphFor>) => g.cards.map((c) => c.nodeId).filter((id) => id !== "stack");
    expect(ids(b)).toEqual(expect.arrayContaining(ids(a)));
  });

  it("limits the number of rendered cards", () => {
    const data = Array.from({ length: 60 }, (_, i) => `v${i}: .space 4`).join("\n");
    const g = graphFor(`.data\n${data}\n.text\nmain: nop\n li $v0,10\n syscall`, 0);
    expect(g.cards.length).toBeLessThanOrEqual(41);
    expect(g.omittedCards).toBeGreaterThan(0);
  });
});
