const { generateAssignmentId } = require('../src/utils');

describe('Test generateAssignmentId TDD tests', () => {

    test('generateAssignmentId creates unique formatted ID', () => {
        const result = generateAssignmentId("Test Draft", "CS-331");
        expect(result).toBe("Test Draft-cs-331");
    });
     test('generateAssignmentId creates unique formatted ID for various inputs', () => {

    const testCases = [
      { course: "CS-331", title: "Test Draft", expected: "CS-331-test-draft" },
      { course: "MATH-101", title: "Homework #1", expected: "MATH-101-homework-1" },
      { course: "BIO-200", title: "Final Project!!!", expected: "BIO-200-final-project" },
    ];

    testCases.forEach(item => {
      const result = generateAssignmentId(item.course, item.title);
      expect(result).toBe(item.expected);
    });
  });


});

