import { Injectable } from '@nestjs/common'
import { Repository } from 'typeorm'

@Injectable()
export class UsersService {
  constructor(private readonly repo: Repository<unknown>) {}
}
