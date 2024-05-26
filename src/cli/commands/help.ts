import { Colors } from "@cross/utils";
import type { KVDBContainer } from "../common.ts";

const helpMessage = `
  ${Colors.bold(Colors.blue("KV Database CLI"))}

  ${Colors.underline("Usage:")}
  <command> [parameters]

  ${Colors.underline("Commands:")}
  ${
  Colors.yellow("open")
} <database_path>     Opens or creates the specified database.
  ${
  Colors.yellow("get")
} <key>               Retrieves the value associated with the key.
  ${
  Colors.yellow("set:boolean")
} <key> <value>       Sets the value for the given key.
  ${
  Colors.yellow("set:string")
} <key> <value>       Sets the value for the given key.
  ${
  Colors.yellow("set:date")
} <key> <value>       Sets the value for the given key.
  ${
  Colors.yellow("set:number")
} <key> <value>       Sets the value for the given key.
  ${
  Colors.yellow("set:json")
} <key> <value>       Sets the value for the given key.
  ${
  Colors.yellow("list")
} [query]           Lists key-value pairs matching the optional query.
  ${
  Colors.yellow("listKeys")
} [query]      Lists keys matching the optional query.
  ${
  Colors.yellow("delete")
} <key>           Deletes the key-value pair with the given key.
  ${Colors.yellow("stats")}                 Displays database statistics.
  ${Colors.yellow("help")}                  Shows this help message.
  ${Colors.yellow("exit")}                  Exits the CLI.
`;

// Explicit return type for clarity
// deno-lint-ignore require-await
async function help(
  _container: KVDBContainer,
  _params: string[],
): Promise<boolean> {
  console.log(helpMessage);
  return true; // Indicate successful command execution
}

export { help };
