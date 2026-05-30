#!/bin/sh
chown -R nextjs:nodejs /app/data
exec gosu nextjs "$@"
