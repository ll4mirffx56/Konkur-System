export const DEFAULT_STUDY_GOALS = {
    weeklyHours: 35,
    monthlyHours: 150,
};
export function validateStudyGoals(value) {
    if (!value || typeof value !== 'object')
        return false;
    const goals = value;
    return typeof goals.weeklyHours === 'number' && Number.isFinite(goals.weeklyHours) && goals.weeklyHours >= 0 && goals.weeklyHours <= 168 &&
        typeof goals.monthlyHours === 'number' && Number.isFinite(goals.monthlyHours) && goals.monthlyHours >= 0 && goals.monthlyHours <= 744;
}
export function sumStudyHoursInRange(records, startDate, endDate) {
    if (!isISODate(startDate) || !isISODate(endDate) || startDate > endDate)
        throw new RangeError('Invalid date range');
    return records.reduce((sum, record) => {
        if (!isISODate(record.date) || record.date < startDate || record.date > endDate || !Number.isFinite(record.hours) || record.hours < 0)
            return sum;
        return sum + record.hours;
    }, 0);
}
/** Negative marking: ((correct × 3) − wrong) / (total × 3) × 100. Blank answers score zero. */
export function calculateExamPercentage(counts) {
    validateExamCounts(counts);
    return ((counts.correct * 3 - counts.wrong) / (counts.total * 3)) * 100;
}
export function validateExamCounts(counts) {
    const values = [counts.total, counts.correct, counts.wrong, counts.blank];
    if (values.some(value => !Number.isInteger(value) || value < 0))
        throw new RangeError('Question counts must be non-negative integers');
    if (counts.total <= 0)
        throw new RangeError('Total question count must be greater than zero');
    if (counts.correct + counts.wrong + counts.blank !== counts.total)
        throw new RangeError('Correct, wrong and blank counts must equal total');
}
function isISODate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
