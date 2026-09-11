import { Controller, Get } from '@nestjs/common'

@Controller()
export class AdminUsersController {
  @Get()
  list() {}
}
