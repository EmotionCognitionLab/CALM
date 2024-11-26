export const earningsTypes = Object.freeze({
    STREAK_BONUS: 'streak_bonus',
    BREATH1: 'breath1',
    COMPLETION_BREATH2: 'c_breath2',
    PERFORMANCE_BREATH2: 'p_breath2',
    TOP_66: 'top_66',
    TOP_25: 'top_25',
    VISIT_1: 'visit1',
    VISIT_2: 'visit2'
});

export const earningsAmounts = Object.freeze({
    [earningsTypes.STREAK_BONUS]: 5,
    [earningsTypes.BREATH1]: 4,
    [earningsTypes.COMPLETION_BREATH2]: 8,
    [earningsTypes.PERFORMANCE_BREATH2]: 4,
    [earningsTypes.TOP_66]: 3,
    [earningsTypes.TOP_25]: 4,
    [earningsTypes.VISIT_1]: 25,
    [earningsTypes.VISIT_2]: 25

});

export const statusTypes = Object.freeze({
    ACTIVE: 'active',
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
