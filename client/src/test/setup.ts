import '@testing-library/jest-dom/vitest';

// jsdom 未实现 Blob.prototype.arrayBuffer —— 为测试补一个（浏览器原生支持）。
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  // 通过 FileReader 或已存的内部字节回退。这里用最简实现：
  // 由构造时的 parts 拼接（jsdom 的 Blob 内部保存了 parts）。
  Blob.prototype.arrayBuffer = async function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(this);
    });
  };
}
