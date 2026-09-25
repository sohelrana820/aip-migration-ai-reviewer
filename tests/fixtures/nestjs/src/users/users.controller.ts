import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'

@Controller('api/v1/users')
export class UsersController {
  @Get()
  findAll() {}

  @Post()
  create(@Body() body: any) {}

  @Get(':id')
  findOne(@Param('id') id: string) {}

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {}

  @Delete(':id')
  remove(@Param('id') id: string) {}
}
