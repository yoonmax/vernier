import { describe, expect, it } from 'vitest';
import {
  cmPer360,
  degreesPerCount,
  radiansPerCount,
  sensitivityFromCmPer360,
  sensitivityToSlider,
  sliderToSensitivity,
} from '../../src/input/SensitivityController.js';

describe('sensitivity conversion', () => {
  it('uses 0.022 degrees per count at sensitivity 1', () => {
    expect(degreesPerCount(1)).toBeCloseTo(0.022, 10);
    expect(radiansPerCount(1)).toBeCloseTo((0.022 * Math.PI) / 180, 12);
  });

  it('scales linearly with sensitivity', () => {
    expect(radiansPerCount(2.5)).toBeCloseTo(radiansPerCount(1) * 2.5, 12);
  });

  it('computes distance per full turn', () => {
    // 360 / 0.022 = 16363.6 counts. At 800 counts per inch that is 20.45 in, or 51.95 cm.
    expect(cmPer360(1, 800)).toBeCloseTo(51.95, 1);
    expect(cmPer360(2, 800)).toBeCloseTo(51.95 / 2, 1);
    expect(cmPer360(1, 1600)).toBeCloseTo(51.95 / 2, 1);
  });

  it('round-trips between sensitivity and cm/360', () => {
    expect(sensitivityFromCmPer360(cmPer360(1.37, 1200), 1200)).toBeCloseTo(1.37, 8);
  });

  it('guards invalid inputs to cm/360', () => {
    expect(cmPer360(0, 800)).toBe(Infinity);
    expect(cmPer360(1, 0)).toBe(Infinity);
  });

  it('maps the slider logarithmically and invertibly', () => {
    expect(sliderToSensitivity(0, 0.02, 20)).toBeCloseTo(0.02);
    expect(sliderToSensitivity(1, 0.02, 20)).toBeCloseTo(20);
    expect(sliderToSensitivity(0.5, 0.02, 20)).toBeCloseTo(0.632, 2);
    expect(sensitivityToSlider(sliderToSensitivity(0.37, 0.02, 20), 0.02, 20)).toBeCloseTo(0.37);
  });
});
