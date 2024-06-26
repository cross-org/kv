import { Colors } from "@cross/utils";
import type { KVDBContainer } from "../common.ts";

const helpMessage = `
  ${Colors.underline("Usage:")}
  <command> [parameters]

  ${Colors.underline("Commands:")}
  ${
  Colors.yellow("open")
} <database_path>      Opens or creates the specified database.
  ${
  Colors.yellow("open:noindex")
} <db_path>    Opens or creates the specified database for set/del only.
  ${
  Colors.yellow("get")
} <key>                 Retrieves the value associated with the key.
  ${
  Colors.yellow("set:boolean")
} <key> <value> Sets a boolean value for the given key.
  ${
  Colors.yellow("set:string")
} <key> <value>  Sets a string value for the given key.
  ${
  Colors.yellow("set:date")
} <key> <value>    Sets a date value for the given key.
  ${
  Colors.yellow("set:number")
} <key> <value>  Sets a numeric value for the given key.
  ${
  Colors.yellow("set:json")
} <key> <value>    Sets a JSON value for the given key.
  ${
  Colors.yellow("list")
} query                Lists key-value pairs recursively matching the query.
  ${
  Colors.yellow("keys")
} [query]              Lists keys matching the optional query.
  ${
  Colors.yellow("delete")
} <key>              Deletes the key-value pair with the given key.
  ${
  Colors.yellow("scan")
} <key>                Iterates over transactions matching the given key, returning full data.
  ${
  Colors.yellow("count")
} [query]             Counts key-value pairs recursively matching the optional query.
  ${
  Colors.yellow("vacuum")
}                    Compacts the database file to reclaim space.
  ${
  Colors.yellow("unlock")
}                    Forcefully releases the database lock if it's held.
  ${
  Colors.yellow("stats")
}                     Displays database and process information.
  ${Colors.yellow("help")}                      Shows this help message.
  ${
  Colors.yellow("close")
}                     Closes the currently open database.
  ${Colors.yellow("exit")}                      Exits the CLI.
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
