#!/bin/bash

# Not sure it is necessary to create a swapfile:
# afaik, the simple script should not want to allocate huge amounts of memory.

# fallocate -l 512M /swapfile
# chmod 0600 /swapfile
# mkswap /swapfile
# echo 10 >/proc/sys/vm/swappiness
# swapon /swapfile
# echo 1 >/proc/sys/vm/overcommit_memory

# Remove prisma migrate
# npx prisma migrate deploy

# ... in favour of the migrate script
node scripts/migrate.js