const { isValidSemesterDate } = require('../src/utils');

const SPRING = new Date('2026-03-01');
const SUMMER = new Date('2026-06-15');
const FALL   = new Date('2026-10-01');

describe('Test isValidSemesterDate TDD tests', () => {

    test('isValidSemesterDate returns true for empty date', () => {
        expect(isValidSemesterDate('')).toBe(true);
    });

    test('isValidSemesterDate returns true for Spring 2026 dates', () => {
        expect(isValidSemesterDate('2026-04-07', SPRING)).toBe(true);
        expect(isValidSemesterDate('2026-01-30', SPRING)).toBe(true);
        expect(isValidSemesterDate('2026-05-08', SPRING)).toBe(true);
    });

    test('isValidSemesterDate returns false for dates outside Spring 2026', () => {
        expect(isValidSemesterDate('2025-12-03', SPRING)).toBe(false);
        expect(isValidSemesterDate('2028-04-12', SPRING)).toBe(false);
        expect(isValidSemesterDate('2026-05-15', SPRING)).toBe(false);
    });

    test('isValidSemesterDate returns true for Summer 2026 dates', () => {
        expect(isValidSemesterDate('2026-06-01', SUMMER)).toBe(true);
        expect(isValidSemesterDate('2026-08-10', SUMMER)).toBe(true);
    });

    test('isValidSemesterDate returns false for dates outside Summer 2026', () => {
        expect(isValidSemesterDate('2026-04-07', SUMMER)).toBe(false);
        expect(isValidSemesterDate('2026-08-11', SUMMER)).toBe(false);
    });

    test('isValidSemesterDate returns true for Fall 2026 dates', () => {
        expect(isValidSemesterDate('2026-09-01', FALL)).toBe(true);
        expect(isValidSemesterDate('2026-12-31', FALL)).toBe(true);
    });

    test('isValidSemesterDate returns false for dates outside Fall 2026', () => {
        expect(isValidSemesterDate('2026-08-14', FALL)).toBe(false);
        expect(isValidSemesterDate('2025-11-01', FALL)).toBe(false);
    });

});
