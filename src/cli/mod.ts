import { main, registerCommand } from "./loop.ts";

import { help } from "./commands/help.ts";
import { open } from "./commands/open.ts";
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
import { listKeys } from "./commands/listkeys.ts";
import { scan } from "./commands/scan.ts";
import { sysinfo } from "./commands/sysinfo.ts";

registerCommand("help", help);
registerCommand("open", open);
registerCommand("get", get);
registerCommand("list", list);
registerCommand("keys", listKeys);
registerCommand("scan", scan);
registerCommand("set:number", setNumber);
registerCommand("set:json", setJson);
registerCommand("set:string", setString);
registerCommand("set:date", setDate);
registerCommand("set:boolean", setBoolean);
registerCommand("del", del);
registerCommand("sysinfo", sysinfo);

main();
