export const earningsTypes = Object.freeze({
    PER_HOUR: 'per_hour',
    LUMOSITY: 'lumosity',
    BONUS: 'bonus',
    VISIT_1: 'visit1',
    VISIT_2: 'visit2'
});

export const earningsAmounts = Object.freeze({
    [earningsTypes.PER_HOUR]: 10,
    [earningsTypes.LUMOSITY]: 2,
    [earningsTypes.BONUS]: 6,
    [earningsTypes.VISIT_1]: 25,
    [earningsTypes.VISIT_2]: 25

});

export const statusTypes = Object.freeze({
    STAGE_1_COMPLETE: 'stage1Complete',
    STAGE_1_COMPLETED_ON: 'stage1CompletedOn',
    STAGE_2_COMPLETE: 'stage2Complete',
    STAGE_2_COMPLETED_ON: 'stage2CompletedOn',
    COMPLETE: 'complete',
    DROPPED: 'dropped'
})

export const maxSessionMinutes = 18;
export const minSessionSeconds = 30;
export const stage2BreathingMinutes = 2;
