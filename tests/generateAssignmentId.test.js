const { generateAssignmentId } = require('../src/utils');

describe('Test generateAssignmentId TDD tests', () => {

    test('generateAssignmentId creates unique formatted ID', () => {
        const result = generateAssignmentId("Test Draft", "CS-331");
        expect(result).toBe("test draft-cs-331");
    });
     test('generateAssignmentId creates unique formatted ID for various inputs', () => {

    const testCases = [
      { course: "cs-331", title: "test draft", expected: "cs-331-test-draft" },
      { course: "math-101", title: "homework #1", expected: "math-101-homework-1" },
      { course: "bio-200", title: "final project!!!", expected: "bio-200-final-project" },
    ];

    testCases.forEach(item => {
      const result = generateAssignmentId(item.course, item.title);
      expect(result).toBe(item.expected);
    });
  });


});

