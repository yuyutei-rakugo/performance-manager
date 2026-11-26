// RFC 8291 payload encryption and RFC 8292 VAPID authorization.
// Random salt and an ephemeral P-256 key come from the caller.
import {p256} from '@noble/curves/nist';
import {gcm} from '@noble/ciphers/aes';
import {extract, expand} from '@noble/hashes/hkdf';
import {sha256} from '@noble/hashes/sha256';
import {concatBytes} from '@noble/hashes/utils';

const ascii = text => Uint8Array.from(text, char => char.charCodeAt(0));

export function publicKey(privateKey) {
  return p256.getPublicKey(privateKey, false);
}

export function validatePublicKey(key) {
  p256.Point.fromHex(key).assertValidity();
}

export function seal(receiver, auth, ephemeralKey, salt, message) {
  const sender = publicKey(ephemeralKey);
  const secret = p256.getSharedSecret(ephemeralKey, receiver).slice(1);
  const ikm = expand(sha256, extract(sha256, secret, auth),
    concatBytes(ascii('WebPush: info\0'), receiver, sender), 32);
  const prk = extract(sha256, ikm, salt);
  const key = expand(sha256, prk, ascii('Content-Encoding: aes128gcm\0'), 16);
  const nonce = expand(sha256, prk, ascii('Content-Encoding: nonce\0'), 12);
  if (message.length > 3993) throw Error('通知文が長すぎます。');
  return concatBytes(salt, Uint8Array.of(0, 0, 16, 0, sender.length), sender,
    gcm(key, nonce).encrypt(concatBytes(message, Uint8Array.of(2))));
}

export function signVapid(encodedClaims, privateKey) {
  return p256.sign(sha256(ascii(encodedClaims)), privateKey, {extraEntropy:false}).toCompactRawBytes();
}
