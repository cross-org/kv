import { main, registerCommand } from "./loop.ts";

import { help } from "./commands/help.ts";
import { open, openNoIndex } from "./commands/open.ts";
import { get } from "./commands/get.ts";
import {
  setBoolean,
  setDate,
  setJson,
  setNumber,
  setString,
} from "./commands/set.ts";
import { del } from "./commands/delete.ts";
import { list } from "./commands/list.ts";
import { listKeys } from "./commands/keys.ts";
import { scan } from "./commands/scan.ts";
import { sysinfo } from "./commands/sysinfo.ts";
import { count } from "./commands/count.ts";

import packageJson from "../../deno.json" with { type: "json" };
import { Colors } from "@cross/utils";
console.log(`@cross/kv ${Colors.dim(`v${packageJson.version}`)}`);

registerCommand("help", help);
registerCommand("open", open);
registerCommand("open:noindex", openNoIndex);
registerCommand("get", get);
registerCommand("list", list);
registerCommand("keys", listKeys);
registerCommand("scan", scan);
registerCommand("set:number", setNumber);
registerCommand("set:json", setJson);
registerCommand("set:string", setString);
registerCommand("set:date", setDate);
registerCommand("set:boolean", setBoolean);
registerCommand("delete", del);
registerCommand("sysinfo", sysinfo);
registerCommand("count", count);

main();
