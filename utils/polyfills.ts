// Polyfill browser globals for libraries running in React Native
class DummyHTMLAnchorElement {}

if (typeof (globalThis as any).HTMLAnchorElement === 'undefined') {
  (globalThis as any).HTMLAnchorElement = DummyHTMLAnchorElement;
}

export {};
