// 受控文件下载：绝不让 <a href=blob:> 的默认行为「导航」到 blob URL。
//
// 背景：直接用 <a href={blobUrl} download>，在部分移动端浏览器/WebView（iOS Safari、
// 某些 Android WebView）不尊重 download 属性时，点击会「导航」到该 blob URL → 当前
// 单页应用被卸载 → 触发 pagehide/beforeunload → 聊天室会话被清空并退出。
//
// 解决：拿回 blob 数据，重封装为 application/octet-stream（浏览器无法内联展示 →
// 只能触发「保存」），再用程序化 anchor.click() 下载，随后立即 revoke 临时 URL。
// 全程不发生页面导航，聊天室不受影响。

export async function downloadBlobUrl(blobUrl: string, filename: string): Promise<void> {
  let forcedUrl: string | null = null;
  try {
    // 从本地 blob URL 取回原始字节（同源、无网络请求）。
    const resp = await fetch(blobUrl);
    const raw = await resp.blob();
    // 重封装为 octet-stream，强制「附件/保存」语义，杜绝内联导航。
    const forced = new Blob([raw], { type: 'application/octet-stream' });
    forcedUrl = URL.createObjectURL(forced);

    const a = document.createElement('a');
    a.href = forcedUrl;
    a.download = filename || 'download';
    a.rel = 'noopener';
    // 不加 target=_blank：新标签在个别环境仍可能被拦截或影响当前页；
    // 程序化点击一个 download anchor 是最不干扰当前页面的方式。
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // 兜底：极少数环境 fetch(blob:) 失败时，退回程序化点击原始 URL 的 anchor。
    // 仍不改动 window.location，尽量不触发导航。
    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'download';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* 实在不行就放弃，至少不退出聊天室 */
    }
  } finally {
    // 稍后再 revoke，给浏览器发起下载留出时间。
    if (forcedUrl) {
      const u = forcedUrl;
      setTimeout(() => URL.revokeObjectURL(u), 10_000);
    }
  }
}
