import { useCallback, useEffect, useRef } from "react";

interface UseInfiniteScrollProps {
    status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted",
    loadMore: (numitems : number) => void;
    loadSize?: number;
    observerEnabled?:boolean
}

export const UseInfiniteScrollProps = ({
    status,
    loadMore,
    loadSize=10,
    observerEnabled = true
}: UseInfiniteScrollProps) => {
    const topElement = useRef<HTMLDivElement>(null);
}