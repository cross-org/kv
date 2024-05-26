import { Colors } from "@cross/utils";

import type { KVCliHandler, KVDBContainer } from "./common.ts";

// Command handling structure
const commands: { [command: string]: KVCliHandler } = {};

// Command registration function
export function registerCommand(command: string, handler: KVCliHandler) {
  commands[command.toLowerCase()] = handler;
}

// Main loop
export async function main() {
  const container: KVDBContainer = {};
  let exit = false;

  while (!exit) {
    const command = await prompt(Colors.blue(">"));
    if (command === null) {
      continue;
    }
    const commandSplit = command.split(" ");
    const cmd = commandSplit[0].toLowerCase();
    const startTime = performance.now(); // Start measuring time
    if (commands[cmd]) {
      const success = await commands[cmd](container, commandSplit.slice(1));
      const endTime = performance.now(); // End measuring time
      const elapsedTime = (endTime - startTime).toFixed(2); // Calculate elapsed time (in milliseconds)
      console.log(
        `${success ? Colors.green("Success") : Colors.red("Failed")}`,
        `[${elapsedTime} ms]\n`,
      );
    } else if (cmd === "close") {
      await container.db?.close();
      console.log(Colors.yellow("Database closed.\n"));
      container.db = undefined;
    } else if (cmd === "exit") {
      await container.db?.close();
      container.db = undefined;
      exit = true;
    } else {
      console.error(Colors.red("Invalid command.\n"));
    }
  }
}
