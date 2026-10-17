import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMeasurement,measurementInput} from '../public/measurements.js';
import {calculate} from '../calculations.mjs';

test('measurement entry supports decimals, leading dots, whole numbers and fractions without rounding', () => {
  for (const [input, expected] of [
    ['51.875', 51.875], ['36.58', 36.58], ['.625', 0.625], ['0.625', 0.625],
    ['36.625', 36.625], ['625', 625], ['51.', 51], ['51.875"', 51.875],
    [' 36 5/8″ ', 36.625], ['5/8', 0.625], ['36.580125', 36.580125],
  ]) assert.equal(parseMeasurement(input), expected, input);
  for (const input of ['', '.', '36..58', '36 1/0', '36 2/1', '36e2', '36abc', '3"6']) {
    assert.throws(() => parseMeasurement(input), undefined, input);
  }
});

test('reopened measurement fields retain decimal precision in either unit', () => {
  assert.equal(measurementInput(51.875), '51.875');
  assert.equal(measurementInput(36.580125), '36.580125');
  assert.equal(measurementInput(.625), '0.625');
  assert.equal(measurementInput(625 / 25.4, 'mm'), '625');
  assert.equal(measurementInput(625.625 / 25.4, 'mm'), '625.625');
  assert.equal(measurementInput(51.875, 'mm'), '1317.625');
});

test('decimal opening measurements reach the workbook without rounding to whole inches or fractions', () => {
  const opening = {name:'Decimal reference',width:parseMeasurement('51.875'),height:parseMeasurement('36.58'),quantity:1,left:1,right:1,frame:'TR',louver:4,mount:'I',sizeMethod:'S',sides:'4W',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
  const parts = calculate(opening).parts;
  assert.ok(Math.abs(parts.find(p => p.name === 'Louvers').length - 532.5125) < 1e-8);
  assert.ok(Math.abs(parts.find(p => p.name === 'Left frame').length - 929.132) < 1e-8);
  const metric = calculate({...opening,width:parseMeasurement('625')/25.4});
  assert.ok(Math.abs(metric.parts.find(p => p.name === 'Top frame').length - 625) < 1e-8);
});
