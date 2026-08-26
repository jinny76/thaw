// 通用确认框（间谍风）。用于拦截误触退出等不可逆操作。
// extra：可选的第三个动作（如「复制房间信息」），不关闭弹窗。

import type { ReactNode } from 'react';

export function ConfirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  extra,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  extra?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="confirm__box" onClick={(e) => e.stopPropagation()}>
        <p className="confirm__title">{`> ${title}`}</p>
        <p className="confirm__msg">{message}</p>
        {extra && <div className="confirm__extra">{extra}</div>}
        <div className="confirm__actions">
          <button type="button" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={danger ? 'confirm__danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
