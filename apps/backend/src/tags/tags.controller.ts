import { Controller, Get, Query } from '@nestjs/common';
import { TagsService } from './tags.service';

@Controller()
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  // Public type-ahead (autocomplete for the keyword box). Keywords are free
  // and need no approval — this just offers consistent common suggestions.
  @Get('tags')
  search(@Query('q') q?: string, @Query('kind') kind?: string) {
    return this.tags.search(q, kind);
  }
}
