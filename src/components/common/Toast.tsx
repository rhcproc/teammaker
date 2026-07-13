import React, { useEffect } from "react";

interface ToastProps {
  message: string;
  show: boolean;
  onClose: () => void;
  duration?: number; // ms
}

const Toast: React.FC<ToastProps> = ({ message, show, onClose, duration = 2500 }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [show, onClose, duration]);

  if (!show) return null;
  return (
    <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded shadow-lg z-50 animate-fade-in flex items-center">
      <span>{message}</span>
      <button className="ml-4 text-sm underline" onClick={onClose}>닫기</button>
    </div>
  );
};

export default Toast; 