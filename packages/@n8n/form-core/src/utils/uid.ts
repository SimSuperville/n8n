const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Small collision-resistant id generator; avoids an external dependency in the public bundle */
export function uid(length = 12): string {
	let id = '';
	const cryptoApi = globalThis.crypto;
	if (cryptoApi?.getRandomValues !== undefined) {
		const bytes = new Uint8Array(length);
		cryptoApi.getRandomValues(bytes);
		for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
		return id;
	}
	for (let i = 0; i < length; i++) {
		id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
	}
	return id;
}
