import { Module } from "@nestjs/common";
import { IGDBService } from "./igdb.service";

@Module({
    providers: [IGDBService],
    exports: [IGDBService]
})
export class IGDBModule {}