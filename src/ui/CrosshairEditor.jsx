import { useEffect, useRef, useState } from 'react';
import { ColorField, Segmented, SettingRow, SliderField, Toggle } from './controls.jsx';
import { drawCrosshair } from './crosshairGeometry.js';
import { coloursAreSimilar } from '../rendering/themes.js';

const COLOR_PRESETS = [
  { value: '#000000', label: 'Black' },
  { value: '#ffffff', label: 'White' },
  { value: '#00e5ff', label: 'Cyan' },
  { value: '#ff2a2a', label: 'Red' },
  { value: '#22e05b', label: 'Green' },
];

const STYLES = [
  { value: 'cross', label: 'Cross' },
  { value: 'dot', label: 'Dot' },
  { value: 'cross-dot', label: 'Cross and dot' },
  { value: 'hidden', label: 'Hidden' },
];

const BACKDROPS = [
  { value: 'wall', label: 'Wall' },
  { value: 'target', label: 'Target' },
  { value: 'dark', label: 'Dark' },
];

/** Live preview at true in-game size, using the same drawing code as the game itself. */
function CrosshairPreview({ crosshair }) {
  const canvas = useRef(null);
  const [backdrop, setBackdrop] = useState('wall');

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(128 * dpr);
    const node = canvas.current;
    node.width = size;
    node.height = size;
    drawCrosshair(node.getContext('2d'), crosshair, dpr, size);
  }, [crosshair]);

  const backgrounds = { wall: '#d3d8dc', target: '#f7f8f8', dark: '#1d2024' };

  return (
    <div className="flex items-end gap-5 pb-3">
      <div className="grid h-32 w-32 place-items-center border border-rule" style={{ background: backgrounds[backdrop] }}>
        <canvas ref={canvas} data-testid="crosshair-preview" style={{ width: 128, height: 128 }} aria-label="Crosshair preview" />
      </div>
      <div>
        <div className="mb-1 text-sm text-ink-soft">Preview on</div>
        <Segmented label="Preview background" value={backdrop} options={BACKDROPS} onChange={setBackdrop} />
      </div>
    </div>
  );
}

export function CrosshairEditor({ values, update, targetColor }) {
  const set = (key) => (value) => update('crosshair', key, value);
  const hasLines = values.style === 'cross' || values.style === 'cross-dot';
  const hasDot = values.style === 'dot' || values.style === 'cross-dot';
  const hidden = values.style === 'hidden';
  const hardToSee = !hidden && !values.outline && coloursAreSimilar(values.color, targetColor);

  return (
    <>
      <CrosshairPreview crosshair={values} />
      {hardToSee && (
        <p role="note" data-testid="crosshair-contrast" className="pb-3 text-[13px] leading-snug text-ink-soft">
          Your crosshair and targets are similar colours, so the crosshair can disappear on a target.
          Turn on the outline below, or choose a different colour.
        </p>
      )}
      <SettingRow label="Style">
        <Segmented label="Crosshair style" value={values.style} options={STYLES} onChange={set('style')} />
      </SettingRow>
      {!hidden && (
        <>
          <SettingRow label="Colour">
            <ColorField label="Crosshair colour" value={values.color} presets={COLOR_PRESETS} onChange={set('color')} />
          </SettingRow>
          {hasLines && (
            <>
              <SettingRow label="Thickness">
                <SliderField label="Thickness" value={values.thickness} min={1} max={6} step={0.5} decimals={1} suffix="px" onChange={set('thickness')} />
              </SettingRow>
              <SettingRow label="Length">
                <SliderField label="Length" value={values.length} min={1} max={24} step={1} suffix="px" onChange={set('length')} />
              </SettingRow>
              <SettingRow label="Gap">
                <SliderField label="Gap" value={values.gap} min={0} max={16} step={1} suffix="px" onChange={set('gap')} />
              </SettingRow>
            </>
          )}
          {hasDot && (
            <SettingRow label="Dot size">
              <SliderField label="Dot size" value={values.dotSize} min={1} max={10} step={1} suffix="px" onChange={set('dotSize')} />
            </SettingRow>
          )}
          <SettingRow label="Opacity">
            <SliderField label="Opacity" value={values.opacity} min={0.1} max={1} step={0.05} decimals={2} onChange={set('opacity')} />
          </SettingRow>
          <SettingRow label="Outline" hint="Keeps the crosshair readable over any background.">
            <Toggle label="Outline" checked={values.outline} onChange={set('outline')} />
          </SettingRow>
          {values.outline && (
            <>
              <SettingRow label="Outline thickness">
                <SliderField label="Outline thickness" value={values.outlineThickness} min={1} max={3} step={1} suffix="px" onChange={set('outlineThickness')} />
              </SettingRow>
              <SettingRow label="Outline colour">
                <ColorField label="Outline colour" value={values.outlineColor} presets={COLOR_PRESETS} onChange={set('outlineColor')} />
              </SettingRow>
            </>
          )}
          <SettingRow label="Pulse on hit" hint="Off keeps the crosshair completely still.">
            <Toggle label="Pulse on hit" checked={values.hitFeedback} onChange={set('hitFeedback')} />
          </SettingRow>
        </>
      )}
    </>
  );
}
