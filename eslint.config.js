import antfu from '@antfu/eslint-config'
import formattingRulesOff from 'eslint-config-prettier'

export default antfu(
	{
		stylistic: false,
		lessOpinionated: true,
		vue: true,
		ignores: ['dist/**', 'test-results/**', 'playwright-report/**', 'tests/.*'],
	},
	formattingRulesOff,
	{ rules: { curly: ['error', 'all'] } },
)
