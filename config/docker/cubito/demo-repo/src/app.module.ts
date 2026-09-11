import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { UsersController } from './users/users.controller'
import { AuthController } from './auth/auth.controller'
import { UsersService } from './users/users.service'
import { AdminModule } from './admin/admin.module'
import { AdminUsersModule } from './admin/users/admin-users.module'

@Module({
  controllers: [UsersController, AuthController],
  providers: [UsersService],
  imports: [
    RouterModule.register([
      {
        path: 'admin',
        module: AdminModule,
        children: [{ path: 'users', module: AdminUsersModule }]
      }
    ])
  ]
})
export class AppModule {}
