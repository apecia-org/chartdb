import React, { useCallback, useEffect, useState } from 'react';
import { useDialog } from '@/hooks/use-dialog';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import type { BaseDialogProps } from '../common/base-dialog-props';
import { useTranslation } from 'react-i18next';
import { useStorage } from '@/hooks/use-storage';
import type { Diagram } from '../../lib/domain/diagram';

export interface RenameDiagramDialogProps extends BaseDialogProps {
    diagram?: Diagram;
    refetch?: () => void;
}

export const RenameDiagramDialog: React.FC<RenameDiagramDialogProps> = ({ 
    dialog,
    diagram = null,
    refetch
}) => {

    const { t } = useTranslation();
    const [newDiagramName, setNewDiagramName] = useState('');
    const { closeRenameDiagramDialog } = useDialog();
    const { updateDiagram } = useStorage();

    useEffect(() => {
        if (!dialog.open) return;
        setNewDiagramName('')
    }, [dialog.open]);

    const handleConfirm = useCallback(() => {
        if (newDiagramName.trim() && diagram?.id) {
            updateDiagram({ id: diagram.id, attributes: { name: newDiagramName } });
            closeRenameDiagramDialog();
            console.log('refetch')
            refetch?.(); 
        }
    }, [newDiagramName, diagram, updateDiagram, closeRenameDiagramDialog, refetch]);

    return (
        <Dialog
            {...dialog}
            onOpenChange={(open) => {
                if (!open) {
                    closeRenameDiagramDialog();
                }
            }}
        >
            <DialogContent className="flex flex-col" showClose>
                <DialogHeader>
                    <DialogTitle>{t('Rename Diagram: {{name}}', {name: diagram?.name ?? null})}</DialogTitle>
                </DialogHeader>
                    <input
                        type="text"
                        placeholder="New Diagram Name"
                        value={newDiagramName}
                        onChange={(e) => setNewDiagramName(e.target.value)}
                        className="mt-3 w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring focus:ring-blue-400"
                    />
                <DialogFooter className="flex gap-1 md:justify-between">
                    <DialogClose asChild>
                        <Button variant="secondary">
                            {t('rename_diagram_dialog.close')}
                        </Button>
                    </DialogClose>
                    <DialogClose asChild>
                        <Button onClick={handleConfirm}>
                            {t('rename_diagram_dialog.confirm')}
                        </Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
