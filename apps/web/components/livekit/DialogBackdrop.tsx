export interface DialogBackdropProps {
  open: boolean;
  onClose: () => void;
}

export default function DialogBackdrop({ open, onClose }: DialogBackdropProps) {
  if (!open) return null;
  return (
    <button
      type="button"
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm appearance-none border-none p-0 m-0 cursor-default"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label="Close"
    />
  );
}
