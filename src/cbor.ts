import { addExtension, Decoder, Encoder } from "cbor-x";
import { KVKey } from "./key.ts";

addExtension({
  Class: KVKey,
  tag: 43331, // register our own extension code (a tag code)
  //@ts-ignore external
  encode(instance, encode) {
    // define how your custom class should be encoded
    // @ts-ignore external
    encode(instance.get()); // return a buffer
  },
  //@ts-ignore external
  decode(data) {
    // @ts-ignore external
    return new KVKey(data as (string | number)[]); // decoded value from buffer
  },
});

export const extEncoder = new Encoder();
export const extDecoder = new Decoder();
