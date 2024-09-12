// Print application header
import packageJson from "../../deno.json" with { type: "json" };
import { Colors } from "@cross/utils";
console.log(`@cross/kv ${Colors.dim(`v${packageJson.version}`)}`);

// Register commands
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
import { stats } from "./commands/stats.ts";
import { count } from "./commands/count.ts";
import { vacuum } from "./commands/vacuum.ts";
import { repair } from "./commands/repair.ts";
import { unlock } from "./commands/unlock.ts";
import { sync } from "./commands/sync.ts";
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
registerCommand("stats", stats);
registerCommand("count", count);
registerCommand("vacuum", vacuum);
registerCommand("repair", repair);
registerCommand("unlock", unlock);
registerCommand("sync", sync);

// Go!
import { main, registerCommand } from "./loop.ts";
main();
