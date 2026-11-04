import { useEffect, useId, useRef, useState } from 'react';
import { clamp } from '../utils/math.js';
import { useUiSound } from './hooks.js';

/**
 * A native range input styled as a vernier scale, so keyboard control, screen readers and
 * pointer capture all behave as they should. The visible scale is decoration over the real input.
 *
 * @param {object} props
 * @param {(position:number) => number} [props.fromPosition] for non-linear sliders
 * @param {(value:number) => number} [props.toPosition]
 */
export function VernierSlider({ label, value, min, max, step, onChange, valueText, fromPosition, toPosition }) {
  const mapped = Boolean(fromPosition);
  const position = mapped ? toPosition(value) : (value - min) / (max - min);
  const percent = clamp(position, 0, 1) * 100;

  return (
    <div className="vernier-slider w-full" style={{ '--position': `${percent}%` }}>
      <div className="track-main scale-main-x" aria-hidden="true" />
      <div className="track-window scale-slide-x" aria-hidden="true" />
      <div className="track-index" aria-hidden="true" />
      <input
        type="range"
        aria-label={label}
        aria-valuetext={valueText}
        min={mapped ? 0 : min}
        max={mapped ? 1000 : max}
        step={mapped ? 1 : step}
        value={mapped ? Math.round(position * 1000) : value}
        onChange={(event) => {
          const raw = Number(event.target.value);
          onChange(mapped ? fromPosition(raw / 1000) : raw);
        }}
      />
    </div>
  );
}

/** A precise number entry. Holds what's typed while editing and commits valid values only. */
export function NumberField({ label, value, min, max, step, decimals = 0, suffix, onChange, width = '5.5rem' }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value.toFixed(decimals);

  const commit = (text) => {
    const parsed = Number(text);
    if (text.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed, min, max));
    setDraft(null);
  };

  return (
    <span className="inline-flex items-baseline gap-1">
      <input
        type="number"
        aria-label={label}
        className="field type-readout text-right text-base"
        style={{ width }}
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value.trim() !== '' && parsed >= min && parsed <= max) onChange(parsed);
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {suffix && <span className="text-sm text-ink-soft">{suffix}</span>}
    </span>
  );
}

/** A slider paired with an exact readout, for the common case. */
export function SliderField({ label, value, min, max, step, decimals = 0, suffix, onChange }) {
  return (
    <div className="flex items-center gap-5">
      <div className="min-w-0 flex-1">
        <VernierSlider
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          valueText={`${value.toFixed(decimals)}${suffix ?? ''}`}
        />
      </div>
      <NumberField
        label={`${label}, exact value`}
        value={value}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        suffix={suffix}
        onChange={onChange}
      />
    </div>
  );
}

/** One choice from a short list, as radio buttons underneath. The chosen one wears the index mark. */
export function Segmented({ label, value, options, onChange, size = 'base' }) {
  const name = useId();
  const sound = useUiSound();
  return (
    <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-1 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={String(option.value)}
            className={`relative cursor-pointer pb-1.5 ${size === 'large' ? 'text-lg' : 'text-[15px]'} ${
              selected ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink'
            } ${option.disabled ? 'pointer-events-none opacity-40' : ''}`}
          >
            <input
              type="radio"
              className="peer sr-only"
              name={name}
              checked={selected}
              disabled={option.disabled}
              onChange={() => {
                sound.hover();
                onChange(option.value);
              }}
            />
            <span className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus)]">
              {option.label}
            </span>
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 bottom-0 h-0.5 ${selected ? 'bg-index' : 'bg-transparent'}`}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

/** On or off, as a real checkbox. */
export function Toggle({ label, checked, onChange }) {
  const sound = useUiSound();
  return (
    <label className="relative inline-flex h-6 w-16 cursor-pointer items-center justify-end">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        className="peer sr-only"
        checked={checked}
        onChange={(event) => {
          sound.hover();
          onChange(event.target.checked);
        }}
      />
      <span aria-hidden="true" className={`text-[15px] ${checked ? 'font-medium text-ink' : 'text-ink-soft'}`}>
        {checked ? 'On' : 'Off'}
      </span>
      <span
        aria-hidden="true"
        className={`ml-2 inline-block h-4 w-2 ${checked ? 'bg-index' : 'border border-rule'} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]`}
      />
    </label>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Preset colours, a colour picker and an exact hexadecimal value. */
export function ColorField({ label, value, presets, onChange }) {
  const [draft, setDraft] = useState(null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex gap-1.5" role="group" aria-label={`${label} presets`}>
        {presets.map((preset) => {
          const selected = preset.value.toLowerCase() === value.toLowerCase();
          return (
            <button
              type="button"
              key={preset.value}
              aria-label={preset.label}
              aria-pressed={selected}
              title={preset.label}
              onClick={() => onChange(preset.value)}
              className="relative h-7 w-7 border border-rule"
              style={{ background: preset.value }}
            >
              {selected && <span aria-hidden="true" className="absolute inset-x-0 -bottom-1.5 h-0.5 bg-index" />}
            </button>
          );
        })}
      </div>
      <input
        type="color"
        aria-label={`${label}, custom colour`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-7 cursor-pointer border border-rule bg-transparent p-0"
      />
      <input
        type="text"
        aria-label={`${label}, hexadecimal value`}
        className="field type-readout w-20 text-base"
        maxLength={7}
        spellCheck={false}
        value={draft ?? value}
        onChange={(event) => {
          setDraft(event.target.value);
          if (HEX.test(event.target.value)) onChange(event.target.value);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

/** A destructive action that needs a second, deliberate click. It backs off after 4 seconds. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = '' }) {
  const [arming, setArming] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={`text-sm ${arming ? 'font-medium text-index' : 'text-ink-soft hover:text-ink'} ${className}`}
      onClick={() => {
        if (arming) {
          clearTimeout(timer.current);
          setArming(false);
          onConfirm();
        } else {
          setArming(true);
          timer.current = setTimeout(() => setArming(false), 4000);
        }
      }}
    >
      {arming ? confirmLabel : label}
    </button>
  );
}

/** One line of a settings list: what it is on the left, the control on the right. */
export function SettingRow({ label, hint, children, stacked = false }) {
  return (
    <div className={`border-b border-rule py-3.5 ${stacked ? '' : 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-6'}`}>
      <div>
        <div className="text-[15px]">{label}</div>
        {hint && <div className="mt-0.5 max-w-prose text-[13px] leading-snug text-ink-soft">{hint}</div>}
      </div>
      <div className={stacked ? 'mt-3' : 'flex justify-end'}>
        <div className={stacked ? '' : 'w-full max-w-md text-right [&>*]:ml-auto'}>{children}</div>
      </div>
    </div>
  );
}
