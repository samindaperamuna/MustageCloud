#!/bin/sh
cd functions
npm install

firebase deploy --project imagesharing-8e0f8 --token 1/EykusFAnDwlB0tJbVOqL_Yy5ozVE8lUG0zCd_rtROfY

#install tags
cd ..

firebase database:update / 'tags/tags.json' --project imagesharing-8e0f8 --token 1/EykusFAnDwlB0tJbVOqL_Yy5ozVE8lUG0zCd_rtROfY --confirm