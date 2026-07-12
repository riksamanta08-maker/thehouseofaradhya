import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";

const noop = () => {};
const SUCCESS_EXTRA_DELAY = 800;
const RESET_DELAY = 1200;

const ProgressButton = ({
  label = "Submit",
  onClick = noop,
  onComplete = noop,
  duration = 2000,
  fullWidth = true,
  className = "",
}) => {
  const [state, setState] = useState("idle");
  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const startTimer = (fn, delay) => {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  };

  const handlePress = () => {
    if (state !== "idle") return;
    setState("loading");

    const maybePromise = onClick?.();
    if (maybePromise?.catch) {
      maybePromise.catch(() => {
        clearTimers();
        setState("idle");
      });
    }

    startTimer(() => {
      setState("success");
      onComplete?.();
      startTimer(() => {
        setState("idle");
      }, RESET_DELAY);
    }, duration + SUCCESS_EXTRA_DELAY);
  };

  return (
    <button
      type="button"
      className={clsx(
        "progress-pill",
        fullWidth && "progress-pill--full",
        className,
      )}
      data-state={state}
      onClick={handlePress}
      disabled={state !== "idle"}
      aria-live="polite"
      aria-busy={state !== "idle"}
      style={{ "--progress-duration": `${duration}ms` }}
    >
      <span className="progress-pill__text">{label}</span>
      <span className="progress-pill__shape" aria-hidden="true">
        <span className="progress-pill__bar" />
      </span>
      <span className="progress-pill__check" aria-hidden="true">
        <svg viewBox="0 0 25 30" role="presentation">
          <path d="M2,19.2C5.9,23.6,9.4,28,9.4,28L23,2" />
        </svg>
      </span>
    </button>
  );
};

export default ProgressButton;
