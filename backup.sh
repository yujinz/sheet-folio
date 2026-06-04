#!/usr/bin/env bash
cd $(dirname "$0")

docker compose stop sheet-folio || exit 1

echo "Backing up sheet-folio."
echo "Packing..."
tar -cvf sheet-folio_backup_$(date +%m_%d_%Y_%H_%M).tar volumes/app/
docker compose up -d
echo "Uploading..."
scp -o StrictHostKeyChecking=no sheet-folio_backup_*.tar web17@$(getent ahosts nas17 | awk '{print $1}' | grep 192.168.1 | head -n 1):/srv/mergerfs/Merger1/merger/otlab/ || exit 1
echo "Cleaning..."
rm --force sheet-folio_backup_*.tar