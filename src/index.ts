import { exists, readFile, writeFile } from "@cross/fs";
import type { KVKey } from "./key.ts";
import { decode, encode } from "cbor-x";

// Nested class to represent a node in the index tree
interface KVIndexContent {
  children: KVIndexNode;
  reference?: number;
}
type KVIndexNode = Map<string | number, KVIndexContent>;

export class KVIndex {
  private indexPath: string;
  private index: KVIndexContent;
  private isDirty: boolean = false;
  constructor(indexPath: string) {
    this.indexPath = indexPath;
    this.index = {
      children: new Map(),
    };
  }

  add(key: KVKey, entry: number, overwrite: boolean = false) {
    let current = this.index;
    let lastPart;
    for (const part of key.get()) {
      lastPart = part;
      const currentPart = current.children?.get(part as string | number);
      if (currentPart) {
        current = currentPart;
      } else {
        const newObj = {
          children: new Map(),
        };
        current.children.set(part as string | number, newObj);
        current = newObj;
      }
    }
    if (current!.reference === undefined) {
      current!.reference = entry;
    } else if (overwrite) {
      /* ToDo: Some sort of callback if overwritten? */
      current!.reference = entry;
    } else {
      throw new Error(`Duplicate key: ${lastPart}`);
    }
    this.isDirty = true;
  }

  delete(key: KVKey): number | undefined {
    let current = this.index;
    for (const part of key.get()) {
      const currentPart = current.children.get(part as (string | number));
      if (!currentPart || !currentPart.children) { // Key path not found
        return undefined;
      }
      current = currentPart;
    }

    // If we reach here, we've found the leaf node
    const oldReference = current.reference;
    current.reference = undefined;
    delete current.reference;
    this.isDirty = true;

    /* ToDo recursive cleanup if (!current.children.size) {
      delete current.children;
    }*/

    return oldReference;
  }

  get(key: KVKey): number[] {
    const resultSet: number[] = [];
    function recurse(node: KVIndexContent): void {
      if (node.reference !== undefined) {
        resultSet.push(node.reference);
      }

      // Recurse into children
      for (const childNode of node.children.values()) {
        recurse(childNode);
      }
    }

    // Start recursion from the appropriate node in the tree
    let current = this.index;

    for (const part of key.get()) {
      const currentPart = current.children.get(part as string | number);
      if (!currentPart) {
        return []; // Key path not found
      }
      current = currentPart;
    }

    recurse(current);

    return resultSet;
  }

  async loadIndex(): Promise<KVIndexContent> {
    if (await exists(this.indexPath)) {
      const fileContents = await readFile(this.indexPath);
      try {
        const index = decode(fileContents);
        this.index = index as KVIndexContent;
        this.isDirty = false;
      } catch (_e) { /* Ignore for now */ }
    }
    return this.index;
  }

  async saveIndex(): Promise<void> {
    if (!this.isDirty) return;
    const serializedIndex = encode(this.index);
    await writeFile(this.indexPath, serializedIndex);
    this.isDirty = false;
  }
}
