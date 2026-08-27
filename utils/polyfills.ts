// Polyfill browser globals for libraries (like write-excel-file / file-saver) running in React Native
class DummyHTMLAnchorElement {}

if (typeof globalThis !== 'undefined') {
  if (typeof (globalThis as any).HTMLAnchorElement === 'undefined') {
    (globalThis as any).HTMLAnchorElement = DummyHTMLAnchorElement;
  }
}
if (typeof global !== 'undefined') {
  if (typeof (global as any).HTMLAnchorElement === 'undefined') {
    (global as any).HTMLAnchorElement = DummyHTMLAnchorElement;
  }
}
if (typeof window !== 'undefined') {
  if (typeof (window as any).HTMLAnchorElement === 'undefined') {
    (window as any).HTMLAnchorElement = DummyHTMLAnchorElement;
  }
}

export {};
