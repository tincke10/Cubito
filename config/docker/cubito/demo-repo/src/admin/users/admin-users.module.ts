import { Module } from '@nestjs/common'
import { AdminUsersController } from './admin-users.controller'

@Module({
  controllers: [AdminUsersController]
})
export class AdminUsersModule {}
