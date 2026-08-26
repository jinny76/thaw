// 通用确认框（间谍风）。用于拦截误触退出等不可逆操作。

export function ConfirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="confirm__box" onClick={(e) => e.stopPropagation()}>
        <p className="confirm__title">{`> ${title}`}</p>
        <p className="confirm__msg">{message}</p>
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
