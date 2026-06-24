import {Button} from"@workspace/ui/components/button";
import { cn } from "../lib/utils.js";

interface InfiniteScrollTriggerProps {
    canLoadMore: boolean,
    isLoadingMore: boolean;
    onLoadMore: () => void;
    loadMoreText?: string;
    noMoreText?: string;
    className?: string;
    ref?: React.Ref<HTMLDivElement> 
}

export const infiniteScrollTrigger = ({
    canLoadMore, 
    isLoadingMore, 
    onLoadMore,
    loadMoreText = "Load More",
    noMoreText = "No more items"
}: InfiniteScrollTriggerProps) => {
    let text = loadMoreText;

    if (isLoadingMore){
        text = "Loading..."
    }else if(!canLoadMore{
        text = noMoreText;
    }

    return (
        <div className={cn("flex w-full justify-center py-2", className)} ref={ref}>
            
        </div>
    )
}