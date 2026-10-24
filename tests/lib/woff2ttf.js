// WOFF 1.0 -> TTF: unpack each table (zlib where compressed) into a plain sfnt
const fs = require("fs"), zlib = require("zlib");
function convert(inp, out) {
  const b = fs.readFileSync(inp);
  if (b.toString("ascii", 0, 4) !== "wOFF") throw new Error("not woff: " + inp);
  const flavor = b.readUInt32BE(4), numTables = b.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = b.toString("ascii", o, o + 4), off = b.readUInt32BE(o + 4), comp = b.readUInt32BE(o + 8), orig = b.readUInt32BE(o + 12), cs = b.readUInt32BE(o + 16);
    let data = b.subarray(off, off + comp);
    if (comp !== orig) data = zlib.inflateSync(data);
    tables.push({ tag, data, cs });
  }
  tables.sort((x, y) => (x.tag < y.tag ? -1 : 1));
  let pow = 1, lg = 0; while (pow * 2 <= numTables) { pow *= 2; lg++; }
  const head = Buffer.alloc(12 + numTables * 16);
  head.writeUInt32BE(flavor, 0); head.writeUInt16BE(numTables, 4); head.writeUInt16BE(pow * 16, 6); head.writeUInt16BE(lg, 8); head.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = head.length; const bodies = [];
  tables.forEach((t, i) => {
    const o = 12 + i * 16; head.write(t.tag, o, 4, "ascii"); head.writeUInt32BE(t.cs, o + 4); head.writeUInt32BE(offset, o + 8); head.writeUInt32BE(t.data.length, o + 12);
    const pad = (4 - (t.data.length % 4)) % 4; bodies.push(t.data, Buffer.alloc(pad)); offset += t.data.length + pad;
  });
  fs.writeFileSync(out, Buffer.concat([head].concat(bodies)));
}
const dir = process.argv[2], outDir = process.argv[3];
fs.readdirSync(dir).filter((f) => f.endsWith(".woff")).forEach((f) => convert(dir + "/" + f, outDir + "/" + f.replace(/\.woff$/, ".ttf")));
console.log("converted", fs.readdirSync(outDir).filter((f) => f.endsWith(".ttf")).length);
