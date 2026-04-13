function generateAssignmentId(courseID, assignmentTitle) {
return `${courseID.toLowerCase()}-${assignmentTitle.toLowerCase().replace(/[^a-z0-9 -]+/g, '').replace(/ /g, '-')}`;
}

function isValidSemesterDate(date, today = new Date()) {
    if (date === '') return true;

    const parsed = new Date(date + 'T00:00:00');
    if (isNaN(parsed)) return false;

    const currentYear = today.getFullYear();
    const todayMD = (today.getMonth() + 1) * 100 + today.getDate();

    let semesterStart, semesterEnd;

    if (todayMD >= 101 && todayMD <= 514) {
        // Spring: Jan 1 - May 14
        semesterStart = new Date(currentYear, 0, 1);
        semesterEnd = new Date(currentYear, 4, 14);
    } else if (todayMD >= 516 && todayMD <= 810) {
        // Summer: May 16 - Aug 10
        semesterStart = new Date(currentYear, 4, 16);
        semesterEnd = new Date(currentYear, 7, 10);
    } else if (todayMD >= 815) {
        // Fall: Aug 15 - Dec 31
        semesterStart = new Date(currentYear, 7, 15);
        semesterEnd = new Date(currentYear, 11, 31);
    } else {
        return false;
    }

    return parsed >= semesterStart && parsed <= semesterEnd;
}

module.exports = {
  generateAssignmentId,
  isValidSemesterDate,
};
