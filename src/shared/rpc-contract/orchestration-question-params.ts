import { z } from 'zod'
import { OptionalString } from './rpc-param-primitives'

export const QuestionListParams = z.object({
  run: z.string().min(1).optional(),
  status: z.enum(['pending', 'answered', 'closed']).optional(),
  // Why: absent for a paired-device lease caller (no terminal); mirrors workerList/gateList.
  from: OptionalString
})
