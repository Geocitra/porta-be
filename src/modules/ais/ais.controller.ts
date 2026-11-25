import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AisService } from './ais.service';

@ApiTags('AIS Radar')
@Controller('ais')
export class AisController {
  constructor(private readonly aisService: AisService) {}

  @Get('stream')
  @ApiOperation({
    summary: 'Stream radar kapal AIS real-time (SSE) dari AISStream.io',
  })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['poumako', 'papua', 'indonesia'],
  })
  streamVessels(
    @Query('scope') rawScope: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const scope = this.aisService.resolveScope(rawScope);
    let closed = false;

    const heartbeat = setInterval(() => {
      if (!closed) {
        res.write(': keepalive\n\n');
      }
    }, 15000);

    const stopUpstream = this.aisService.openUpstreamStream(
      scope,
      (event, data) => {
        if (!closed) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      },
      () => {
        if (!closed) {
          closed = true;
          clearInterval(heartbeat);
          res.end();
        }
      },
    );

    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
      stopUpstream();
    });
  }
}
