import 'package:flota_obd/obd/obd_decoder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('RPM', () {
    final bytes = parseMode01('410C1AF8\r\r>', '0C')!;
    expect(standardPids.firstWhere((p) => p.key == 'rpm').decode(bytes), 1726);
  });

  test('temperatura con eco y SEARCHING', () {
    expect(parseMode01('0105\rSEARCHING...\r41057B\r\r>', '05'), [0x7B]);
  });

  test('DTC CAN', () {
    expect(parseMode03('4302013301340000\r>', isCan: true), ['P0133', 'P0134']);
  });

  test('DTC protocolo antiguo', () {
    expect(parseMode03('43030100000000\r>', isCan: false), ['P0301']);
  });

  test('sin fallas', () {
    expect(parseMode03('NO DATA\r>', isCan: true), isEmpty);
    expect(parseMode03('4300\r>', isCan: true), isEmpty);
  });

  test('voltaje ATRV', () {
    expect(parseVoltage('12.6V\r>'), 12.6);
  });
}
