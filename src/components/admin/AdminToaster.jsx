/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

const AdminToastContext = createContext(null);
const MotionDiv = motion.div;

export const useAdminToast = () => {
    const context = useContext(AdminToastContext);
    if (!context) {
        throw new Error('useAdminToast must be used within an AdminToastProvider');
    }
    return context;
};

export const AdminToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback(({ title, message, type = 'success', duration = 4000 }) => {
        const id = Math.random().toString(36).slice(2, 9);
        setToasts((prev) => [...prev, { id, title, message, type }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const success = useCallback((title, message) => addToast({ title, message, type: 'success' }), [addToast]);
    const error = useCallback((title, message) => addToast({ title, message, type: 'error' }), [addToast]);
    const warning = useCallback((title, message) => addToast({ title, message, type: 'warning' }), [addToast]);
    const info = useCallback((title, message) => addToast({ title, message, type: 'info' }), [addToast]);

    return (
        <AdminToastContext.Provider value={{ success, error, warning, info }}>
            {children}
            <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm">
                <AnimatePresence>
                    {toasts.map((toast) => {
                        let Icon = Info;
                        let containerClass = 'bg-slate-900/90 border-slate-700/50';
                        let iconColor = 'text-blue-400';

                        if (toast.type === 'success') {
                            Icon = CheckCircle2;
                            containerClass = 'bg-emerald-950/90 border-emerald-500/30 shadow-[0_4px_24px_-4px_rgba(16,185,129,0.15)]';
                            iconColor = 'text-emerald-400';
                        } else if (toast.type === 'error') {
                            Icon = XCircle;
                            containerClass = 'bg-rose-950/90 border-rose-500/30 shadow-[0_4px_24px_-4px_rgba(225,29,72,0.15)]';
                            iconColor = 'text-rose-400';
                        } else if (toast.type === 'warning') {
                            Icon = AlertCircle;
                            containerClass = 'bg-amber-950/90 border-amber-500/30 shadow-[0_4px_24px_-4px_rgba(245,158,11,0.15)]';
                            iconColor = 'text-amber-400';
                        }

                        return (
                            <MotionDiv
                                key={toast.id}
                                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                className={`pointer-events-auto flex items-start gap-4 p-4 rounded-xl border backdrop-blur-xl ${containerClass}`}
                            >
                                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
                                <div className="flex-1 min-w-0 pr-2">
                                    <p className="text-sm font-bold text-white tracking-tight">{toast.title}</p>
                                    {toast.message && (
                                        <p className="mt-1 text-xs font-medium text-slate-300 leading-relaxed">{toast.message}</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => removeToast(toast.id)}
                                    className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </MotionDiv>
                        );
                    })}
                </AnimatePresence>
            </div>
        </AdminToastContext.Provider>
    );
};
