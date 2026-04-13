const { isValidSemesterDate } = require('../src/utils');

describe('Test isValidSemesterDate TDD tests', () => {


    test('isValidSemesterDate returns true for Spring 2026 dates', () => {
        expect(isValidSemesterDate('2026-04-07')).toBe(true);
        expect(isValidSemesterDate('2026-01-30')).toBe(true);
        expect(isValidSemesterDate('2026-05-08')).toBe(true);
        expect(isValidSemesterDate('')).toBe(true);

    });

    test('isValidSemesterDate returns false for dates outside Spring 2026', () => {
        expect(isValidSemesterDate('2025-12-03')).toBe(false);
        expect(isValidSemesterDate('2028-04-12')).toBe(false);
        expect(isValidSemesterDate('2026-05-15')).toBe(false);
    });

});

